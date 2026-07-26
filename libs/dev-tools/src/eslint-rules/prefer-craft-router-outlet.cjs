const ANGULAR_ROUTER_OUTLET_IMPORT =
  /import\s*\{[^}]*\bRouterOutlet\b[^}]*\}\s*from\s*['"]@angular\/router['"]/s;
const ANGULAR_ROUTER_OUTLET_TAG =
  /<(\/?)(?<![\w-])router-outlet\b/g;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular RouterOutlet / <router-outlet>. Use the functional CraftRouterOutlet() instead.',
    },
    schema: [],
    messages: {
      forbidden:
        'Use CraftRouterOutlet() from @craft-ng/component inside a Craft component tree instead of Angular RouterOutlet / <router-outlet>.',
    },
  },
  create(context) {
    return {
      'Program:exit'(node) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const text = sourceCode.getText();
        ANGULAR_ROUTER_OUTLET_TAG.lastIndex = 0;

        if (
          !ANGULAR_ROUTER_OUTLET_IMPORT.test(text) &&
          !ANGULAR_ROUTER_OUTLET_TAG.test(text)
        ) {
          return;
        }

        ANGULAR_ROUTER_OUTLET_TAG.lastIndex = 0;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
