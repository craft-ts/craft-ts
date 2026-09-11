const HOVER = /:hover\b/;

/**
 * `:hover` written by hand is a visual state nothing downstream can see.
 *
 * It is not in the class's variant contract, so the matrix never captures it
 * and the static contrast solver never crosses the colours it writes with the
 * text that sits on them. The failure that produces is specific and common: a
 * button that is readable at rest and unreadable under the pointer, in the one
 * state nobody screenshots.
 *
 * `when(interaction.hover, [...])` emits the same `:hover` rule and puts the
 * point in the contract, which is the whole difference. It carries its own
 * driver too, so a capture of the hovered state is something the harness can
 * actually produce rather than a mouse event that sets no pseudo-class.
 *
 * The rule reads string and template literals, which is where a hand-written
 * selector can appear: the generated property table has no way to spell a
 * selector at all, so raw CSS and escape hatches are the only doors left.
 * Same shape and same reasoning as `no-free-has`.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hand-written :hover in styles; use the interaction.hover axis instead.',
    },
    schema: [],
    messages: {
      rawHover:
        ':hover here is invisible to everything that reads the style graph — the visual matrix will not capture the hovered state, and the static contrast check will not test the colours it writes. Write when(interaction.hover, [set(v.bg, ...)]) instead: it emits the same rule, puts the point in the class contract, and carries the driver that reaches it.',
    },
  },
  create(context) {
    const check = (node, text) => {
      if (typeof text === 'string' && HOVER.test(text)) {
        context.report({ node, messageId: 'rawHover' });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
