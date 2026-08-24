const { report } = require('./security-rule-utils.cjs');

/**
 * Attributs d'URL dont le nom n'a pas d'autre sens courant en JavaScript.
 * `data`, `ping`, `cite` ou `manifest` sont exclus à dessein : ce sont des
 * noms de champs métier fréquents, et la règle ne verrait que le nom.
 */
const URL_KEYS = /^(?:href|src|srcset|action|formaction|poster|xlink:href)$/i;
/** Helpers de la lib : leur retour est déjà validé. */
const SAFE_CALLS = new Set(['safeUrl', 'safeResourceUrl', 'safeUrlList']);

function isSafeExpression(node) {
  if (!node) return true;
  switch (node.type) {
    case 'Literal':
    case 'TemplateLiteral':
      // Une URL écrite dans le source n'est pas une donnée utilisateur.
      return true;
    case 'CallExpression':
      return (
        (node.callee.type === 'Identifier' && SAFE_CALLS.has(node.callee.name)) ||
        (node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          SAFE_CALLS.has(node.callee.property.name))
      );
    case 'ConditionalExpression':
      return (
        isSafeExpression(node.consequent) && isSafeExpression(node.alternate)
      );
    case 'LogicalExpression':
      return isSafeExpression(node.left) && isSafeExpression(node.right);
    case 'TSAsExpression':
    case 'TSNonNullExpression':
      return isSafeExpression(node.expression);
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      // Une valeur de template Craft est un générateur ; une fonction
      // ordinaire est un accesseur (`href: () => location.href`), pas une
      // valeur posée dans le DOM.
      return node.generator ? returnsSafely(node) : true;
    default:
      return false;
  }
}

function isTemplateAttributeObject(property, sourceCode) {
  const ancestors = sourceCode.getAncestors
    ? sourceCode.getAncestors(property)
    : [];
  const object = ancestors[ancestors.length - 1];
  const parent = ancestors[ancestors.length - 2];
  return Boolean(
    object &&
      object.type === 'ObjectExpression' &&
      parent &&
      parent.type === 'CallExpression' &&
      parent.arguments.includes(object),
  );
}

/** Vrai quand chaque valeur retournée par le générateur est déjà validée. */
function returnsSafely(node) {
  if (node.body.type !== 'BlockStatement') return isSafeExpression(node.body);
  const returns = [];
  const visit = (statement) => {
    if (!statement || typeof statement.type !== 'string') return;
    if (statement.type === 'ReturnStatement') {
      returns.push(statement.argument);
      return;
    }
    // Les fonctions imbriquées ont leur propre valeur de retour.
    if (
      statement.type === 'FunctionDeclaration' ||
      statement.type === 'FunctionExpression' ||
      statement.type === 'ArrowFunctionExpression'
    ) {
      return;
    }
    for (const key of Object.keys(statement)) {
      const value = statement[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === 'string') visit(value);
    }
  };
  node.body.body.forEach(visit);
  return returns.length > 0 && returns.every(isSafeExpression);
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    docs: { description: 'Sanitize user-controlled DOM URLs.' },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Property(node) {
        const name = node.key && (node.key.name ?? node.key.value);
        if (!URL_KEYS.test(String(name))) return;
        // Les attributs d'un template Craft sont un objet passé en argument
        // d'un helper d'élément — `a('book', { href }, …)`. Un objet affecté
        // à une variable est une structure de données, pas du DOM.
        if (!isTemplateAttributeObject(node, sourceCode)) return;
        if (isSafeExpression(node.value)) return;
        report(
          context,
          node,
          `Wrap the dynamic "${name}" value in safeUrl(), safeResourceUrl() or safeUrlList().`,
        );
      },
    };
  },
};
