const ALLOWED_MODULES = ['@craft-ts/style'];

/**
 * A `*.style.ts` may import style vocabulary and nothing else.
 *
 * This is not a taste rule: the build plugin **imports these modules in Node**
 * to read the values they register. An application import would drag component
 * code, DI, or browser globals into that evaluation, and the emitter would
 * either crash or — worse — succeed while running application side effects at
 * build time.
 *
 * Relative imports are allowed only between style files, so a design system can
 * be split across several of them.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Restrict *.style.ts files to style vocabulary imports so the build plugin can evaluate them in Node.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
          suffix: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      applicationImport:
        "A style file may only import style vocabulary, and '{{source}}' is not. The build plugin imports this file in Node to read the values it registers; an application import would run application code at build time. Move what you need into the sheet, or into another *.style.ts.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const allowed = new Set([...ALLOWED_MODULES, ...(options.allow ?? [])]);
    const suffix = options.suffix ?? '.style.ts';
    const filename = context.filename ?? context.getFilename();

    if (!filename.endsWith(suffix)) return {};

    const check = (node, source) => {
      if (typeof source !== 'string') return;
      if (allowed.has(source)) return;
      // A relative import is fine as long as it lands on another style file:
      // splitting a design system across files must stay possible.
      if (source.startsWith('.') && source.endsWith('.style')) return;
      if (source.startsWith('.') && source.endsWith(suffix.slice(0, -3)))
        return;
      context.report({
        node,
        messageId: 'applicationImport',
        data: { source },
      });
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value);
      },
    };
  },
};
