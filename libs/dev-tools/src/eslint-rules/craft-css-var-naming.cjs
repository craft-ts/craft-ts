const { componentInfo, cssFacts, prefixes } = require('./css-rule-utils.cjs');
module.exports = {
  meta: { type: 'suggestion', schema: [], messages: { naming: '{{name}} must use the component namespace ({{expected}}).' } },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return { CallExpression(node) {
      const info = componentInfo(context, sourceCode, node); if (!info?.css) return;
      const accepted = prefixes(info.name); const facts = cssFacts(info.css);
      const templateText = node.arguments[3] ? sourceCode.getText(node.arguments[3]) : '';
      facts.declared.forEach((name) => {
        const inheritedChildVariable = new RegExp(
          `['\"]${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['\"]\\s*:\\s*inherit\\b`,
        ).test(templateText);
        if (!inheritedChildVariable && ![...accepted].some((prefix) => name.startsWith(prefix))) context.report({ node: info.styles?.value ?? info.stylesUrl.value, messageId: 'naming', data: { name, expected: [...accepted].join(' or ') } });
      });
    } };
  },
};
