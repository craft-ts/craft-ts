const { componentInfo, cssFacts } = require('./css-rule-utils.cjs');
const registrations = new Map();
module.exports = {
  meta: { type: 'problem', schema: [], messages: { duplicate: '@property {{name}} is also registered by {{owner}}. A custom property may have only one owner.' } },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return { CallExpression(node) {
      const info = componentInfo(context, sourceCode, node); if (!info?.css) return;
      cssFacts(info.css).registered.forEach((name) => {
        const previous = registrations.get(name);
        if (previous && previous !== info.name) context.report({ node: info.styles?.value ?? info.stylesUrl.value, messageId: 'duplicate', data: { name, owner: previous } });
        else registrations.set(name, info.name);
      });
    } };
  },
};

