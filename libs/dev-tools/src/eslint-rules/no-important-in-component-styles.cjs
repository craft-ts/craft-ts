const { componentInfo } = require('./css-rule-utils.cjs');
module.exports = {
  meta: { type: 'problem', schema: [], messages: { important: '!important is not allowed in encapsulated component styles.' } },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return { CallExpression(node) {
      const info = componentInfo(context, sourceCode, node);
      if (info?.css && /!important\b/i.test(info.css)) context.report({ node: info.styles?.value ?? info.stylesUrl.value, messageId: 'important' });
    } };
  },
};

