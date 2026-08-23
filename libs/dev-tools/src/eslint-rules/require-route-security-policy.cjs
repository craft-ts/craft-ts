const { report, isCallNamed } = require('./security-rule-utils.cjs');

function nameOf(property) {
  return String(property.key.name ?? property.key.value ?? '');
}

/** `component:`, `loadComponent:` ou le spread `...loadCraftComponent(...)`. */
function rendersComponent(route) {
  return route.properties.some((property) => {
    if (property.type === 'Property') {
      const name = nameOf(property);
      return name === 'component' || name === 'loadComponent';
    }
    if (property.type === 'SpreadElement') {
      return isCallNamed(property.argument, 'loadCraftComponent');
    }
    return false;
  });
}

function declaresPolicy(route) {
  return route.properties.some(
    (property) =>
      property.type === 'Property' &&
      (nameOf(property) === 'ssr' || nameOf(property) === 'security'),
  );
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          /**
           * `auto` (défaut) : n'exige la déclaration que dans un fichier qui
           * en contient déjà une, c'est-à-dire une application qui rend côté
           * serveur. Une route oubliée y est un vrai trou ; une SPA qui ne
           * déclare rien nulle part n'a rien à déclarer.
           * `required` : exige la politique sur toute route rendue.
           * `off` : désactive la vérification.
           */
          mode: { enum: ['auto', 'required', 'off'] },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description: 'Require an explicit SSR policy on every rendered route.',
    },
  },
  create(context) {
    const mode = (context.options[0] && context.options[0].mode) || 'auto';
    if (mode === 'off') return {};
    return {
      CallExpression(node) {
        if (!isCallNamed(node, 'craftRoutes')) return;
        const list = node.arguments.find(
          (argument) => argument.type === 'ArrayExpression',
        );
        if (!list) return;
        const routes = list.elements.filter(
          (element) => element && element.type === 'ObjectExpression',
        );
        const rendered = routes.filter(rendersComponent);
        if (mode === 'auto' && !rendered.some(declaresPolicy)) return;
        for (const route of rendered) {
          if (declaresPolicy(route)) continue;
          const path = route.properties.find(
            (property) =>
              property.type === 'Property' && nameOf(property) === 'path',
          );
          const label =
            path && path.value.type === 'Literal'
              ? `"${path.value.value}"`
              : 'a route';
          report(
            context,
            route,
            `Route ${label} must declare an explicit ssr policy (mode: 'block' | 'skip' | 'stream').`,
          );
        }
      },
    };
  },
};
