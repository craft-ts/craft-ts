const fs = require('node:fs');
const path = require('node:path');
const {
  Project,
  SyntaxKind,
} = require('ts-morph');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require server-function client facades to use a unique key matching their imported server definition.',
    },
    schema: [],
    messages: {
      missingUnique:
        'createServerFunctionClient must receive craftUnique(<static server function id>), or a craftHandshake(...) shared with the server.',
      nonStatic:
        'createServerFunctionClient craftUnique(...) must wrap a string literal server function id.',
      missingDefinition:
        'createServerFunctionClient must reference a server definition with a typeof import from the same family.',
      definitionMismatch:
        'The client facade server definition does not belong to its *.fn-client.ts family.',
      idMismatch:
        'The client facade id "{{clientId}}" does not match server definition id "{{serverId}}".',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filePath = context.getFilename();

    if (!filePath || !filePath.endsWith('.fn-client.ts')) {
      return {};
    }

    return {
      'Program:exit'() {
        const sourceFile = createSourceFile(filePath, sourceCode.getText());
        if (!sourceFile) return;

        for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
          if (call.getExpression().getText() !== 'createServerFunctionClient') {
            continue;
          }

          const reportNode = reportLocation(sourceCode, call.getStart(), call.getEnd());
          const key = readClientKey(call, filePath);
          if (key.kind === 'missing') {
            context.report({ ...reportNode, messageId: 'missingUnique' });
            continue;
          }
          if (key.kind === 'non-static') {
            context.report({ ...reportNode, messageId: 'nonStatic' });
            continue;
          }

          const definition = resolveServerDefinition(sourceFile, call, filePath);
          if (!definition) {
            context.report({ ...reportNode, messageId: 'missingDefinition' });
            continue;
          }

          const clientFamily = filePath.replace(/\.fn-client\.ts$/, '');
          const serverFamily = definition.filePath.replace(/\.fn-serveur\.ts$/, '');
          if (clientFamily !== serverFamily) {
            context.report({ ...reportNode, messageId: 'definitionMismatch' });
            continue;
          }

          if (definition.id !== key.value) {
            context.report({
              ...reportNode,
              messageId: 'idMismatch',
              data: { clientId: key.value, serverId: definition.id ?? '<unknown>' },
            });
          }
        }
      },
    };
  },
};

function createSourceFile(filePath, text) {
  const project = new Project({
    compilerOptions: {
      allowJs: false,
      module: 99,
      target: 9,
      skipLibCheck: true,
    },
  });
  return project.createSourceFile(path.resolve(filePath), text, { overwrite: true });
}

function readClientKey(call, clientFilePath) {
  const argument = call.getArguments()[0];
  // Un `craftHandshake(...)` référencé tient le rôle : les deux côtés passent
  // alors la même valeur, ce qui est une garantie plus forte que la chaîne
  // répétée sous `craftUnique`.
  if (argument && argument.isKind(SyntaxKind.Identifier)) {
    const handshake = readHandshakeName(
      call.getSourceFile(),
      argument.getText(),
      clientFilePath,
    );
    if (handshake !== undefined) return { kind: 'static', value: handshake };
    return { kind: 'missing' };
  }
  if (!argument || !argument.isKind(SyntaxKind.CallExpression)) {
    return { kind: 'missing' };
  }
  if (argument.getExpression().getText() !== 'craftUnique') {
    return { kind: 'missing' };
  }
  const value = argument.getArguments()[0];
  if (
    !value ||
    (!value.isKind(SyntaxKind.StringLiteral) &&
      !value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral))
  ) {
    return { kind: 'non-static' };
  }
  return { kind: 'static', value: value.getLiteralValue() };
}

/**
 * Nom du `craftHandshake('…')` désigné par un identifiant, déclaré localement
 * ou importé — la forme recommandée le met dans un module partagé, donc suivre
 * l'import n'est pas optionnel.
 */
function readHandshakeName(sourceFile, variableName, filePath) {
  const local = handshakeNameInFile(sourceFile, variableName);
  if (local !== undefined) return local;

  const importDeclaration = sourceFile.getImportDeclarations().find((declaration) =>
    declaration.getNamedImports().some(
      (specifier) =>
        (specifier.getAliasNode()?.getText() ?? specifier.getName()) === variableName,
    ),
  );
  if (!importDeclaration || !filePath) return undefined;
  const specifier = importDeclaration.getNamedImports().find(
    (candidate) =>
      (candidate.getAliasNode()?.getText() ?? candidate.getName()) === variableName,
  );
  const importedPath = resolveRelativeImport(
    filePath,
    importDeclaration.getModuleSpecifierValue(),
  );
  if (!specifier || !importedPath || !fs.existsSync(importedPath)) return undefined;
  return handshakeNameInFile(
    createSourceFile(importedPath, fs.readFileSync(importedPath, 'utf8')),
    specifier.getName(),
  );
}

function handshakeNameInFile(sourceFile, variableName) {
  const initializer = sourceFile.getVariableDeclaration(variableName)?.getInitializer();
  if (!initializer) return undefined;
  const call = initializer.isKind?.(SyntaxKind.CallExpression)
    ? initializer
    : initializer.getDescendantsOfKind(SyntaxKind.CallExpression).find(
        (candidate) => candidate.getExpression().getText() === 'craftHandshake',
      );
  if (!call || call.getExpression().getText() !== 'craftHandshake') return undefined;
  const value = call.getArguments()[0];
  return value?.isKind(SyntaxKind.StringLiteral) ? value.getLiteralValue() : undefined;
}

function resolveServerDefinition(sourceFile, call, clientFilePath) {
  const typeArgument = call.getTypeArguments()[0];
  const typeText = typeArgument?.getText() ?? '';
  const match = /^typeof\s+([A-Za-z_$][\w$]*)$/.exec(typeText);
  if (!match) return undefined;

  const importedName = match[1];
  const importDeclaration = sourceFile.getImportDeclarations().find((declaration) =>
    declaration.getNamedImports().some((specifier) =>
      (specifier.getAliasNode()?.getText() ?? specifier.getName()) === importedName,
    ),
  );
  if (!importDeclaration) return undefined;

  const specifier = importDeclaration.getNamedImports().find((candidate) =>
    (candidate.getAliasNode()?.getText() ?? candidate.getName()) === importedName,
  );
  if (!specifier) return undefined;

  const importedFilePath = resolveRelativeImport(
    clientFilePath,
    importDeclaration.getModuleSpecifierValue(),
  );
  if (!importedFilePath?.endsWith('.fn-serveur.ts')) return undefined;

  const serverSource = createSourceFile(
    importedFilePath,
    fs.readFileSync(importedFilePath, 'utf8'),
  );
  if (!serverSource) return undefined;

  const declaration = serverSource.getVariableDeclaration(specifier.getName());
  const serverCall = declaration
    ?.getInitializer()
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((candidate) => candidate.getExpression().getText() === 'serverFunction');
  if (!serverCall) return undefined;

  const firstArgument = serverCall.getArguments()[0];
  // Le serveur nomme son id soit par une chaîne, soit par un handshake partagé,
  // soit par un contrat importé — dans cet ordre.
  const id = firstArgument?.isKind(SyntaxKind.StringLiteral)
    ? firstArgument.getLiteralValue()
    : (firstArgument?.isKind(SyntaxKind.Identifier)
        ? readHandshakeName(serverSource, firstArgument.getText(), importedFilePath)
        : undefined) ?? readImportedContractId(serverSource, firstArgument);

  return {
    filePath: importedFilePath,
    id,
  };
}

function readImportedContractId(serverSource, argument) {
  if (!argument?.isKind(SyntaxKind.Identifier)) return undefined;
  const contractImport = serverSource.getImportDeclarations().find((declaration) =>
    declaration.getNamedImports().some((specifier) => specifier.getName() === argument.getText()),
  );
  const contractSpecifier = contractImport?.getNamedImports().find(
    (specifier) => specifier.getName() === argument.getText(),
  );
  const contractPath = contractImport
    ? resolveRelativeImport(
        serverSource.getFilePath(),
        contractImport.getModuleSpecifierValue(),
      )
    : undefined;
  if (!contractPath) return undefined;

  const contractSource = createSourceFile(
    contractPath,
    fs.readFileSync(contractPath, 'utf8'),
  );
  const contractDeclaration = contractSource?.getVariableDeclaration(
    contractSpecifier?.getAliasNode()?.getText() ?? contractSpecifier?.getName() ?? '',
  );
  const contractCall = contractDeclaration
    ?.getInitializer()
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((candidate) => candidate.getExpression().getText() === 'serverFunctionContract');
  const object = contractCall?.getArguments()[0];
  const idProperty = object?.isKind(SyntaxKind.ObjectLiteralExpression)
    ? object.getProperty('id')
    : undefined;
  const value = idProperty?.isKind(SyntaxKind.PropertyAssignment)
    ? idProperty.getInitializer()
    : undefined;
  return value?.isKind(SyntaxKind.StringLiteral)
    ? value.getLiteralValue()
    : undefined;
}

function resolveRelativeImport(fromFilePath, moduleSpecifier) {
  if (!moduleSpecifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(fromFilePath), moduleSpecifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function reportLocation(sourceCode, start, end) {
  return {
    loc: {
      start: sourceCode.getLocFromIndex(start),
      end: sourceCode.getLocFromIndex(end),
    },
  };
}
