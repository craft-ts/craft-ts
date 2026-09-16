const { componentInfo } = require('./css-rule-utils.cjs');

/**
 * The four properties the contrast proof is made of, written outside the DSL.
 *
 * `color`, `background-color`, `font-size` and `font-weight` are the entire
 * input to the WCAG check. Any of them set in raw CSS is a hole in the proof,
 * and — this is the part that matters — a *silent* one: the static analysis
 * reports nothing about a declaration it never saw, so the run comes back
 * clean on an element whose text may well be unreadable.
 *
 * So the rule is not "raw CSS is bad". It is "a surface cannot be half
 * covered". Either the four properties go through the typed helpers, where
 * the graph can see them, or the surface is explicitly excluded from this
 * lint contract. That exclusion is documentation, not a contrast diagnostic:
 * the style analyser cannot report declarations it never receives.
 *
 * **Declaring a surface uncovered** is the `uncovered` option: a list of path
 * fragments. A global stylesheet, a third-party widget's theme, a legacy
 * screen mid-migration are all legitimate. Keep those exclusions visible in
 * review and do not describe a strict `style:check` as covering them.
 */
const PROPERTIES = [
  'color',
  'background-color',
  'background',
  'font-size',
  'font-weight',
];

/**
 * `color: …` but not `border-color: …` or `--card-color: …`.
 *
 * A custom property assignment is deliberately allowed: writing `--x: red` in
 * raw CSS is still outside the model, but it is caught by the variable rules
 * next door, and flagging it here would report the same line twice.
 */
const declarationOf = (property) =>
  new RegExp(`(^|[;{\\s])${property}\\s*:`, 'i');

const MATCHERS = PROPERTIES.map((property) => ({
  property,
  pattern: declarationOf(property),
}));

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw CSS text and background colours on surfaces declared as covered by the contrast analysis.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          uncovered: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Path fragments whose styles the analysis is known not to cover.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escaped:
        "'{{property}}' is set in raw CSS here, so the static contrast analysis cannot see it — and a property it cannot see is a check that silently passes. Set it through the typed helpers instead: color(theme.ink), bg(theme.raised), font(text.sm), fontWeight(num(600)). If this surface genuinely lives outside CraftTS, add its path to the rule's `uncovered` option as an explicit lint exemption; this does not add an indeterminate row to the contrast report.",
    },
  },
  create(context) {
    const uncovered = context.options[0]?.uncovered ?? [];
    const filename = context.filename ?? context.getFilename();
    if (uncovered.some((fragment) => filename.includes(fragment))) return {};
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        const info = componentInfo(context, sourceCode, node);
        if (!info?.css) return;
        for (const { property, pattern } of MATCHERS) {
          if (!pattern.test(info.css)) continue;
          context.report({
            node: info.styles?.value ?? info.stylesUrl.value,
            messageId: 'escaped',
            data: { property },
          });
        }
      },
    };
  },
};
