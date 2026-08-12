const { componentInfo, kebab } = require('./css-rule-utils.cjs');

module.exports = {
  meta: { type: 'problem', schema: [], messages: { unsafe: '{{message}}' } },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return { CallExpression(node) {
      const info = componentInfo(context, sourceCode, node);
      if (!info?.css) return;
      const css = info.css;
      const report = (message) => context.report({ node: info.styles?.value ?? info.stylesUrl.value, messageId: 'unsafe', data: { message } });
      if (/@import\b/i.test(css)) report('@import is global; move it to the application stylesheet.');
      if (/(^|})\s*(?::root\b|html\b|body\b)/im.test(css)) report(':root, html and body selectors are not allowed in component styles.');
      for (const match of css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/gi)) {
        if (!match[1].startsWith(`${info.name}-`)) report(`@keyframes "${match[1]}" must be renamed "${info.name}-${match[1]}".`);
      }
      const prefix = `--${kebab(info.name)}-`;
      for (const match of css.matchAll(/@property\s+(--[\w-]+)\s*\{([\s\S]*?)\}/gi)) {
        if (!match[1].startsWith(prefix)) report(`@property "${match[1]}" is not owned by ${info.name}; expected ${prefix}*.`);
        if (/inherits\s*:\s*false\b/i.test(match[2]) && css.includes(`var(${match[1]}`)) report(`@property "${match[1]}" uses inherits: false but participates in the component contract.`);
      }
    } };
  },
};

