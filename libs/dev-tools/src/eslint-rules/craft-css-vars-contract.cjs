const { componentInfo, cssFacts } = require('./css-rule-utils.cjs');

module.exports = {
  meta: {
    type: 'problem', schema: [],
    messages: {
      opaque: 'Craft component styles are dynamic and their CSS variable contract cannot be checked.',
      missing: 'External styles use {{name}} but ComponentMeta.cssVars does not declare it.',
      absent: 'External styles use CSS variables but ComponentMeta.cssVars is missing.',
      unused: 'ComponentMeta.cssVars declares {{name}}, but the stylesheet never declares or consumes it.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return { CallExpression(node) {
      const info = componentInfo(context, sourceCode, node);
      if (!info || (!info.styles && !info.stylesUrl)) return;
      if (info.opaque) return context.report({ node: info.styles?.value ?? info.stylesUrl.value, messageId: 'opaque' });
      const facts = cssFacts(info.css);
      if (info.external && facts.used.size && !info.cssVars) {
        context.report({ node: info.stylesUrl.value, messageId: 'absent' });
      }
      if (info.cssVars) {
        facts.used.forEach((name) => {
          if (!info.contract.has(name)) context.report({ node: info.cssVars.value, messageId: 'missing', data: { name } });
        });
        info.contract.forEach((name) => {
          if (!facts.used.has(name) && !facts.declared.has(name)) context.report({ node: info.cssVars.value, messageId: 'unused', data: { name } });
        });
      }
    } };
  },
};

