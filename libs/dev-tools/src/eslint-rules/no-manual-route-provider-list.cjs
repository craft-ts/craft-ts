'use strict';

const ts = require('typescript');

const SERVICE_NAME = /(?:Service|Provider)$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow manually enumerating application providers in RouteCheckedDI.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const manualAliases = new Map();

    return {
      TSTypeAliasDeclaration(node) {
        const names = stringLiteralUnion(node.typeAnnotation);
        if (names.length > 0 && names.some((name) => SERVICE_NAME.test(name))) {
          manualAliases.set(node.id.name, node);
        }
      },
      'Program:exit'(program) {
        for (const node of program.body) {
          if (node.type !== 'TSTypeAliasDeclaration') continue;
          const aliases = routeCheckedDiAliases(node.typeAnnotation);
          if (aliases.length === 0) continue;
          const availableNames = aliases[0];
          const names = stringLiteralUnion(availableNames);
          if (names.some((name) => SERVICE_NAME.test(name))) {
            report(node, availableNames);
          }
        }

        for (const node of manualAliases.values()) {
          const usedByRouteCheck = sourceCode.ast.body.some(
            (statement) =>
              statement.type === 'TSTypeAliasDeclaration' &&
              routeCheckedDiAliases(statement.typeAnnotation).some(
                (availableNames) =>
                  availableNames.type === 'TSTypeReference' &&
                  availableNames.typeName.type === 'Identifier' &&
                  availableNames.typeName.name === node.id.name,
              ),
          );
          if (usedByRouteCheck) report(node, node.typeAnnotation);
        }
      },
    };

    function report(node, providerType) {
      context.report({
        node,
        message:
          'Do not maintain a manual provider-name list for RouteCheckedDI. Derive application providers from craftAppConfig (AppProvidedServiceNamesOf<typeof appConfig>) or keep only the route context providers.',
      });
    }
  },
};

function routeCheckedDiAliases(typeNode) {
  if (!typeNode || typeNode.type !== 'TSTypeReference') return [];
  if (
    typeNode.typeName.type !== 'Identifier' ||
    typeNode.typeName.name !== 'RouteCheckedDI'
  ) {
    return [];
  }
  return typeNode.typeArguments?.params?.slice(1, 2) ?? [];
}

function stringLiteralUnion(node) {
  if (!node) return [];
  if (node.type === 'TSLiteralType' && typeof node.literal.value === 'string') {
    return [node.literal.value];
  }
  if (node.type === 'TSUnionType') {
    return node.types.flatMap(stringLiteralUnion);
  }
  return [];
}
