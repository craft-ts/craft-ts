const HAS = /:has\(/;

/**
 * `:has()` in hand-written CSS reaches across a component boundary.
 *
 * A component whose appearance depends on markup it does not own has visual
 * states nobody can enumerate — the matrix would have to know what every caller
 * puts inside it. `descendant.userInvalid` and its siblings are the closed set
 * that can be enumerated, and each one carries the driver that reaches it.
 *
 * The combinators that stay inside a component — `+`, `~`, `:nth-child` — are
 * deliberately not restricted: they cannot see past the subtree the component
 * renders itself.
 *
 * This is the net under raw CSS, not the mechanism: the generated property
 * table has no way to spell a selector at all.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow free-form :has() in styles; use the descendant.* axis instead.',
    },
    schema: [],
    messages: {
      freeHas:
        ':has() here reaches across the component boundary, so what this component looks like depends on markup it does not own — a state the visual matrix cannot enumerate. Use the descendant axis instead: when(descendant.userInvalid, [...]), which is a closed set and carries its own test driver.',
    },
  },
  create(context) {
    const check = (node, text) => {
      if (typeof text === 'string' && HAS.test(text)) {
        context.report({ node, messageId: 'freeHas' });
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
