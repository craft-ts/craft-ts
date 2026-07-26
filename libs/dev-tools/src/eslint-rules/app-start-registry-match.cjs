const fs = require('node:fs');
const path = require('node:path');
const {
  IndentationText,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
} = require('ts-morph');

const projectCache = new Map();

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure craftService definitions using onAppStart are registered in CraftAppStartRegistry.',
    },
    fixable: 'code',
    schema: [],
  },
  create(context) {
    return {
      'Program:exit'() {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const filePath = getFilePath(context);
        if (!filePath || !filePath.endsWith('.ts')) {
          return;
        }

        const text = sourceCode.getText();
        if (!text.includes('onAppStart')) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const requiredRegistrations = collectRequiredRegistrations(sourceFile);
        if (requiredRegistrations.length === 0) {
          return;
        }

        const registryState = analyzeRegistryState(
          sourceFile,
          requiredRegistrations,
        );
        if (
          registryState.missing.length === 0 &&
          registryState.outOfDate.length === 0
        ) {
          return;
        }

        ensureRegistryEntries(sourceFile, requiredRegistrations);
        const fixedText = sourceFile.getFullText();
        if (fixedText === text) {
          return;
        }

        context.report({
          loc: getNodeLoc(sourceCode, registryState.reportNode),
          message: formatRegistryMessage(registryState),
          fix(fixer) {
            return fixer.replaceTextRange([0, text.length], fixedText);
          },
        });
      },
    };
  },
};

function getProject(cwd) {
  let project = projectCache.get(cwd);
  if (project) {
    return project;
  }

  const manipulationSettings = {
    indentationText: IndentationText.TwoSpaces,
    quoteKind: QuoteKind.Single,
  };
  const tsConfigFilePath = path.join(cwd, 'tsconfig.json');
  project = fs.existsSync(tsConfigFilePath)
    ? new Project({
        tsConfigFilePath,
        manipulationSettings,
      })
    : new Project({
        compilerOptions: {
          experimentalDecorators: true,
          target: 9,
        },
        manipulationSettings,
      });

  projectCache.set(cwd, project);
  return project;
}

function getProjectSourceFile(project, filePath, text) {
  const normalizedPath = path.resolve(filePath);
  const existingSourceFile = project.getSourceFile(normalizedPath);
  if (existingSourceFile) {
    existingSourceFile.replaceWithText(text);
    return existingSourceFile;
  }

  const sourceFile = project.addSourceFileAtPathIfExists(normalizedPath);
  if (sourceFile) {
    sourceFile.replaceWithText(text);
    return sourceFile;
  }

  return project.createSourceFile(normalizedPath, text, { overwrite: true });
}

function getFilePath(context) {
  const filePath = context.filename ?? context.getFilename();
  if (!filePath || filePath === '<input>') {
    return undefined;
  }

  return filePath;
}

function getCwd(context) {
  return context.cwd ?? process.cwd();
}

function collectRequiredRegistrations(sourceFile) {
  const registrations = new Map();

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializerIfKind(
      SyntaxKind.CallExpression,
    );
    if (!initializer || getCallExpressionName(initializer) !== 'craftService') {
      continue;
    }

    if (!containsOnAppStartCall(initializer)) {
      continue;
    }

    const tag = readCraftServiceName(initializer);
    const serviceReference = readServiceReferenceName(declaration, tag);
    if (!tag || !serviceReference || registrations.has(tag)) {
      continue;
    }

    registrations.set(tag, {
      tag,
      serviceReference,
      reportNode: initializer,
    });
  }

  return [...registrations.values()];
}

function getCallExpressionName(callExpression) {
  const expression = callExpression.getExpression();
  return Node.isIdentifier(expression) ? expression.getText() : undefined;
}

function containsOnAppStartCall(callExpression) {
  return callExpression
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((innerCall) => getCallExpressionName(innerCall) === 'onAppStart');
}

function readCraftServiceName(callExpression) {
  const [definitionArgument] = callExpression.getArguments();
  if (
    !definitionArgument ||
    !Node.isObjectLiteralExpression(definitionArgument)
  ) {
    return undefined;
  }

  const nameProperty = definitionArgument
    .getProperties()
    .find(
      (property) =>
        Node.isPropertyAssignment(property) && property.getName() === 'name',
    );
  if (!nameProperty || !Node.isPropertyAssignment(nameProperty)) {
    return undefined;
  }

  const initializer = nameProperty.getInitializer();
  if (
    !initializer ||
    (!Node.isStringLiteral(initializer) &&
      !Node.isNoSubstitutionTemplateLiteral(initializer))
  ) {
    return undefined;
  }

  return initializer.getLiteralText();
}

function readServiceReferenceName(declaration, serviceName) {
  const nameNode = declaration.getNameNode();
  if (!Node.isObjectBindingPattern(nameNode)) {
    return undefined;
  }

  const bindingElement =
    nameNode
      .getElements()
      .find((element) => element.getNameNode().getText() === serviceName) ??
    (nameNode.getElements().length === 1
      ? nameNode.getElements()[0]
      : undefined);

  return bindingElement?.getNameNode().getText();
}

function analyzeRegistryState(sourceFile, requiredRegistrations) {
  const moduleDeclaration = getCraftCoreModuleDeclaration(sourceFile);
  const registryInterface = moduleDeclaration?.getInterface(
    'CraftAppStartRegistry',
  );
  const propertiesByName = new Map(
    (registryInterface?.getProperties() ?? []).map((property) => [
      readPropertyName(property),
      property,
    ]),
  );
  const missing = [];
  const outOfDate = [];

  for (const registration of requiredRegistrations) {
    const property = propertiesByName.get(registration.tag);
    if (!property) {
      missing.push(registration.tag);
      continue;
    }

    const currentType = normalizeText(property.getTypeNode()?.getText() ?? '');
    const expectedType = normalizeText(
      `typeof ${registration.serviceReference}`,
    );
    if (currentType !== expectedType) {
      outOfDate.push(registration.tag);
    }
  }

  return {
    missing,
    outOfDate,
    reportNode: requiredRegistrations[0].reportNode,
  };
}

function getCraftCoreModuleDeclaration(sourceFile) {
  return sourceFile.getModules().find((moduleDeclaration) => {
    const nameNode = moduleDeclaration.getNameNode();
    return (
      Node.isStringLiteral(nameNode) &&
      nameNode.getLiteralText() === '@craft-ng/core'
    );
  });
}

function readPropertyName(property) {
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode) || Node.isPrivateIdentifier(nameNode)) {
    return nameNode.getText();
  }

  if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }

  return property.getName();
}

function ensureRegistryEntries(sourceFile, requiredRegistrations) {
  const moduleDeclaration =
    getCraftCoreModuleDeclaration(sourceFile) ??
    sourceFile.addModule({
      name: "'@craft-ng/core'",
      hasDeclareKeyword: true,
    });
  const registryInterface =
    moduleDeclaration.getInterface('CraftAppStartRegistry') ??
    moduleDeclaration.addInterface({
      name: 'CraftAppStartRegistry',
    });
  const propertiesByName = new Map(
    registryInterface
      .getProperties()
      .map((property) => [readPropertyName(property), property]),
  );

  for (const registration of requiredRegistrations) {
    const expectedType = `typeof ${registration.serviceReference}`;
    const property = propertiesByName.get(registration.tag);
    if (!property) {
      registryInterface.addProperty({
        name: formatPropertyName(registration.tag),
        type: expectedType,
      });
      continue;
    }

    property.setType(expectedType);
  }
}

function formatPropertyName(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;
}

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}

function formatRegistryMessage({ missing, outOfDate }) {
  const segments = [];
  if (missing.length > 0) {
    segments.push(`missing ${formatNameList(missing)}`);
  }

  if (outOfDate.length > 0) {
    segments.push(`out of date for ${formatNameList(outOfDate)}`);
  }

  return `CraftAppStartRegistry is ${segments.join(' and ')}. Run ESLint --fix on this file to register app-start services.`;
}

function formatNameList(names) {
  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}
