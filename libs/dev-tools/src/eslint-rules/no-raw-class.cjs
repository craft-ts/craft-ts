const STYLE_MODULE = '@craft-ts/style';

/**
 * A `class:` binding is a sheet class, never a string.
 *
 * Without this, the visual matrix is a fiction: a class assembled at render
 * time is a visual state nothing recorded, so the matrix enumerates what the
 * sheets declare while the DOM shows something else. Partial tightness here
 * buys 0 % of the guarantee, not 90 %.
 *
 * It fires **only in files that import `@craft-ts/style`**. A component that
 * has not been migrated is not claiming the guarantee, and reporting it would
 * teach people to disable the rule long before the app is ready for it. The day
 * a file starts using the design system, it starts being held to it.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow string and computed class bindings in files that use @craft-ts/style.',
    },
    schema: [],
    messages: {
      rawClass:
        'A class binding must be a class from a craftStyles sheet, not a string. This one is invisible to the visual matrix, so the state it produces is one nothing will ever capture. Move the rule into the sheet and bind the class it returns.',
      computedClass:
        'A class binding must not be computed at render time. Every string this can produce is a visual state nobody can enumerate; make the variation an axis — when(tone.danger, [...]) — and set a data attribute instead.',
    },
  },
  create(context) {
    let usesStyle = false;
    const reports = [];

    const report = (node, messageId) => reports.push({ node, messageId });

    const inspect = (value) => {
      if (!value) return;
      if (value.type === 'Literal' && typeof value.value === 'string') {
        report(value, 'rawClass');
        return;
      }
      if (value.type === 'TemplateLiteral') {
        report(value, value.expressions.length ? 'computedClass' : 'rawClass');
        return;
      }
      if (
        value.type === 'FunctionExpression' ||
        value.type === 'ArrowFunctionExpression'
      ) {
        report(value, 'computedClass');
      }
    };

    return {
      ImportDeclaration(node) {
        if (node.source.value === STYLE_MODULE) usesStyle = true;
      },
      Property(node) {
        const key = node.key;
        const name =
          key.type === 'Identifier'
            ? key.name
            : key.type === 'Literal'
              ? key.value
              : undefined;
        if (name !== 'class') return;
        inspect(node.value);
      },
      'Program:exit'() {
        if (!usesStyle) return;
        for (const entry of reports) context.report(entry);
      },
    };
  },
};
