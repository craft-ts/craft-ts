const { componentInfo } = require('./css-rule-utils.cjs');
module.exports = {
  meta: { type: 'suggestion', schema: [], messages: { hardcoded: 'Component styles contain hard-coded color values; expose design values through component CSS variables.' } },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return { CallExpression(node) {
      const info = componentInfo(context, sourceCode, node); if (!info?.css) return;
      const declarationsRemoved = info.css.replace(/--[\w-]+\s*:[^;}]+[;}]/g, '');
      if (/(#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(|\b(?:red|blue|green|orange|gray|white|black)\b)/i.test(declarationsRemoved)) {
        context.report({ node: info.styles?.value ?? info.stylesUrl.value, messageId: 'hardcoded' });
      }
    } };
  },
};

