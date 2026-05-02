const BLOCKED_GLOBALS = new Map([
  ['window', 'BrowserWindow'],
  ['document', 'BrowserDocument'],
  ['localStorage', 'LocalStorage'],
  ['sessionStorage', 'SessionStorage'],
  ['location', 'BrowserLocation'],
  ['history', 'BrowserHistory'],
  ['navigator', 'BrowserNavigator'],
  ['performance', 'BrowserPerformance'],
  ['crypto', 'BrowserCrypto'],
  ['console', 'Console'],
  ['alert', 'BrowserWindow.alert'],
  ['confirm', 'BrowserWindow.confirm'],
  ['scrollTo', 'BrowserWindow.scrollTo'],
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct browser globals when an @craft-ng browser boundary exists.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function report(node, actualName) {
      const preferredBoundary = BLOCKED_GLOBALS.get(actualName);

      if (!preferredBoundary) {
        return;
      }

      context.report({
        node,
        message: `Use the @craft-ng browser boundary ${preferredBoundary} instead of direct ${actualName} access.`,
      });
    }

    function findReference(node) {
      let scope = sourceCode.getScope(node);

      while (scope) {
        const reference = scope.references.find(
          (candidate) => candidate.identifier === node,
        );

        if (reference) {
          return reference;
        }

        scope = scope.upper;
      }

      return undefined;
    }

    function isGlobalReference(node) {
      const reference = findReference(node);
      return Boolean(
        reference &&
          (reference.resolved == null || reference.resolved.defs.length === 0),
      );
    }

    return {
      Identifier(node) {
        if (!BLOCKED_GLOBALS.has(node.name) || !isGlobalReference(node)) {
          return;
        }

        report(node, node.name);
      },
      MemberExpression(node) {
        if (
          node.object.type !== 'Identifier' ||
          node.object.name !== 'globalThis' ||
          !isGlobalReference(node.object) ||
          node.property.type !== 'Identifier' ||
          node.computed ||
          !BLOCKED_GLOBALS.has(node.property.name)
        ) {
          return;
        }

        report(node, node.property.name);
      },
    };
  },
};
