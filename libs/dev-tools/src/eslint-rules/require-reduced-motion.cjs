'use strict';

const { componentInfo } = require('./css-rule-utils.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require @media (prefers-reduced-motion) when component styles use @keyframes or transition.',
    },
    schema: [],
    messages: {
      missing:
        'Component styles use {{feature}} but never gate motion with prefers-reduced-motion.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        const info = componentInfo(context, sourceCode, node);
        if (!info?.css) return;
        const hasKeyframes = /@keyframes\b/.test(info.css);
        const hasTransition = /\btransition(?:-duration|-property|-timing-function)?\s*:/.test(
          info.css,
        );
        if (!hasKeyframes && !hasTransition) return;
        if (/prefers-reduced-motion/.test(info.css)) return;
        context.report({
          node: info.styles?.value ?? info.stylesUrl.value,
          messageId: 'missing',
          data: { feature: hasKeyframes ? '@keyframes' : 'transition' },
        });
      },
    };
  },
};
