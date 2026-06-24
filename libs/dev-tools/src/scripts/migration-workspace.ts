import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph';

const ESLINT_CONFIG_NAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];

export function migrateEslintConfig(
  project: Project,
  searchFromDir: string,
): SourceFile | undefined {
  const filePath = findUp(searchFromDir, ESLINT_CONFIG_NAMES);
  if (!filePath) return undefined;
  const sourceFile =
    project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
  const rulesObjects = sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((property) => property.getName() === 'rules')
    .map((property) => ({
      config: property.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression),
      rules: property.getInitializer(),
    }))
    .filter(
      (entry): entry is { config: NonNullable<typeof entry.config>; rules: NonNullable<typeof entry.rules> } =>
        Boolean(entry.config && Node.isObjectLiteralExpression(entry.rules)),
    );
  const rulesEntry =
    rulesObjects.find((entry) =>
      /\*\*\/\*\.ts|\.tsx|\[jt\]s/.test(
        entry.config.getProperty('files')?.getText() ?? '',
      ),
    ) ?? rulesObjects.at(-1);
  const rules =
    rulesEntry && Node.isObjectLiteralExpression(rulesEntry.rules)
      ? rulesEntry.rules
      : undefined;
  if (!rules) return undefined;
  const changedReturnTypeRule = setRule(
    rules,
    '@typescript-eslint/explicit-function-return-type',
    "'off'",
  );
  const changedEmptyObjectRule = setRule(
    rules,
    '@typescript-eslint/no-empty-object-type',
    "['error', { allowObjectTypes: 'always' }]",
  );
  return changedReturnTypeRule || changedEmptyObjectRule ? sourceFile : undefined;
}

function setRule(
  rules: import('ts-morph').ObjectLiteralExpression,
  ruleName: string,
  initializer: string,
): boolean {
  const existing = rules.getProperty(
    (property) =>
      Node.isPropertyAssignment(property) &&
      getPropertyName(property.getNameNode()) === ruleName,
  );
  if (Node.isPropertyAssignment(existing)) {
    if (existing.getInitializer()?.getText() === initializer) return false;
    existing.setInitializer(initializer);
  } else {
    rules.addPropertyAssignment({ name: `'${ruleName}'`, initializer });
  }
  return true;
}

function getPropertyName(node: Node): string {
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralValue()
    : node.getText();
}

function findUp(startDir: string, names: readonly string[]): string | undefined {
  let current = resolve(startDir);
  while (true) {
    for (const name of names) {
      const candidate = join(current, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
