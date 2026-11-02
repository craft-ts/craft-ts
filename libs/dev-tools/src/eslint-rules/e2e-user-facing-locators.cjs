/**
 * An e2e test finds elements the way a user does: by role, label or text.
 *
 * A class or an id is how the page is styled or wired today; the first
 * restyling breaks the test although no behaviour changed. That is exactly
 * the coupling that makes refactoring expensive, so it is refused here.
 */
const LOCATOR_METHODS = new Set([
  'locator',
  '$',
  '$$',
  '$eval',
  '$$eval',
  'waitForSelector',
]);

// Playwright selector engines that do not name a class or an id.
const USER_FACING_ENGINES = /^\s*(?:text|role|data-testid|internal:(?:role|text|label|attr|testid))=/;

/** `.foo` or `#foo` outside attribute brackets and quoted strings. */
function namesClassOrId(selector) {
  if (USER_FACING_ENGINES.test(selector)) return false;
  const bare = selector
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/\[[^\]]*\]/g, '[]');
  return /(?:^|[\s>+~,(=\w\])])[.#][A-Za-z_-][\w-]*/.test(bare);
}

function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Locate elements by role, label or text in e2e tests, not by CSS class or id.' },
    schema: [],
    messages: {
      cssLocator: 'Localisez « {{selector}} » comme un utilisateur : getByRole, getByLabel ou getByText. Une classe ou un id CSS casse au premier changement de style, sans qu’aucun comportement n’ait changé.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (!LOCATOR_METHODS.has(callee.property.name)) return;
        const selector = staticString(node.arguments[0]);
        if (selector === undefined || !namesClassOrId(selector)) return;
        context.report({ node: node.arguments[0], messageId: 'cssLocator', data: { selector } });
      },
    };
  },
};
